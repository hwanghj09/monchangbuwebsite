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
const ENCRYPTION_SECRET = crypto.randomBytes(32).toString('hex'); // 32바이트 암호화 키 생성

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

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
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
      res.redirect('/profile');
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
});
