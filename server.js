const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');

// 환경 변수 설정
const GOOGLE_CLIENT_ID = '908214582199-sqsmujo3eb3utgn6jrhp95tspaallk2d.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const GOOGLE_CALLBACK_URL = 'https://monchangbuwebsite.onrender.com/auth/google/callback';
const DATABASE_URL = 'postgresql://hwanghj09:bGTMWup7u3rpjAcDasyainqTf37vRFnu@dpg-cv7ei1tumphs738hfiqg-a.oregon-postgres.render.com/mcb';
const SESSION_SECRET = 'mysecret';
const ENCRYPTION_SECRET = 'a8f9e4b1c7d3f6a2e9b5c1d7f3a4b8e2'

// PostgreSQL 연결 설정
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Express 앱 초기화
const app = express();

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 세션 설정
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1일
    secure: process.env.NODE_ENV === 'production', // 로컬 환경에서는 false, 배포 환경에서는 true
    httpOnly: true, // JavaScript에서 접근 불가 (보안 강화)
    sameSite: 'None'
  }
}));

// Passport 설정
app.use(passport.initialize());
app.use(passport.session());

// 사용자 직렬화/역직렬화
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return done(new Error('User not found'), null);
    }
    done(null, result.rows[0]);
  } catch (error) {
    console.error('Error during deserialization:', error);
    done(error, null);
  }
});

// Google 전략 설정
passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: GOOGLE_CALLBACK_URL,
  passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    const existingUser = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
    
    if (existingUser.rows.length > 0) {
      return done(null, existingUser.rows[0]);
    }

    const newUser = await pool.query(
      'INSERT INTO users (google_id, email, display_name, picture) VALUES ($1, $2, $3, $4) RETURNING *',
      [
        profile.id,
        profile.emails[0].value,
        profile.displayName,
        profile.photos[0].value
      ]
    );

    return done(null, newUser.rows[0]);
  } catch (error) {
    console.error('Error during Google OAuth process:', error);
    return done(error, null);
  }
}));
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}


// 암호화 함수
function encryptEmail(email) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_SECRET), iv);
  let encrypted = cipher.update(email, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// 복호화 함수
function decryptEmail(encryptedEmail) {
  const parts = encryptedEmail.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_SECRET), iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// 라우트 설정
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/calendar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calendar.html'));
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
    try {
      const encryptedEmail = encryptEmail(req.user.email);
      res.cookie('userEmail', encryptedEmail, {
        maxAge: 24 * 60 * 60 * 1000 * 30,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'None'
      });
      res.redirect('/');
    } catch (error) {
      console.error('Error during the callback handling:', error);
      res.status(500).send('Internal Server Error');
    }
  }
);

app.get('/logout', (req, res) => {
  req.logout(err => {
    if (err) {
      console.error('Error during logout:', err);
      return res.status(500).send('Internal Server Error');
    }
    res.redirect('/');
  });
});

app.get('/api/user', (req, res) => {
  res.json({ isAuthenticated: req.isAuthenticated() });
});

app.get('/api/events', isLoggedIn, async (req, res) => {
  const userId = req.user.id;
  
  try {
    const result = await pool.query(
      'SELECT date, description, id FROM cal WHERE user_id = $1 ORDER BY date ASC',
      [userId]
    );
    
    // 클라이언트에서 사용하기 쉬운 형식으로 데이터 변환
    const events = {};
    result.rows.forEach(row => {
      // 날짜 형식 변환 (YYYY-MM-DD)
      const date = new Date(row.date);
      const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      
      if (!events[dateKey]) {
        events[dateKey] = [];
      }
      
      events[dateKey].push({
        id: row.id,
        description: row.description
      });
    });
    
    res.json({ events });
  } catch (error) {
    console.error('이벤트 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 캘린더 이벤트 저장 API 개선
app.post('/save-event', isLoggedIn, async (req, res) => {
  const { date, description } = req.body;
  const userId = req.user.id;

  if (!date || !description) {
    return res.status(400).json({ error: '날짜와 설명을 모두 작성해주세요.' });
  }

  try {
    // 이벤트 저장
    const result = await pool.query(
      'INSERT INTO cal (user_id, date, description) VALUES ($1, $2, $3) RETURNING id',
      [userId, date, description]
    );
    
    res.json({ 
      success: true, 
      message: '이벤트가 저장되었습니다.',
      eventId: result.rows[0].id
    });
  } catch (error) {
    console.error('DB 저장 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 이벤트 삭제 API 추가
app.delete('/api/events/:id', isLoggedIn, async (req, res) => {
  const eventId = req.params.id;
  const userId = req.user.id;
  
  try {
    // 해당 이벤트가 현재 로그인한 사용자의 것인지 확인
    const checkResult = await pool.query(
      'SELECT * FROM cal WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(403).json({ error: '해당 이벤트를 삭제할 권한이 없습니다.' });
    }
    
    // 이벤트 삭제
    await pool.query('DELETE FROM cal WHERE id = $1', [eventId]);
    
    res.json({ success: true, message: '이벤트가 삭제되었습니다.' });
  } catch (error) {
    console.error('이벤트 삭제 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
});
