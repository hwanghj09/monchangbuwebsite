const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Pool } = require('pg');
const path = require('path');

// 환경 변수 설정
const GOOGLE_CLIENT_ID = '908214582199-sqsmujo3eb3utgn6jrhp95tspaallk2d.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const GOOGLE_CALLBACK_URL = 'https://monchangbuwebsite.onrender.com/auth/google/callback';
const DATABASE_URL = 'postgresql://hwanghj09:bGTMWup7u3rpjAcDasyainqTf37vRFnu@dpg-cv7ei1tumphs738hfiqg-a.oregon-postgres.render.com/mcb';
const SESSION_SECRET = 'mysecret';

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
    secure: process.env.NODE_ENV === 'production', // HTTPS에서만 쿠키 전송
    httpOnly: true,             // 자바스크립트에서 접근 불가
    sameSite: 'None'            // Cross-site 쿠키 허용
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
    done(null, result.rows[0]);
  } catch (error) {
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
    // 기존 사용자 확인
    const existingUser = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
    
    if (existingUser.rows.length > 0) {
      return done(null, existingUser.rows[0]);
    }
    
    // 새 사용자 생성
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    const photo = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

    const newUser = await pool.query(
      'INSERT INTO users (google_id, email, display_name, profile_picture) VALUES ($1, $2, $3, $4) RETURNING *',
      [
        profile.id,
        email,
        profile.displayName,
        photo
      ]
    );
    
    return done(null, newUser.rows[0]);
  } catch (error) {
    return done(error, null);
  }
}));

// 로그인 상태 확인 미들웨어
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

// 라우트 설정
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Google 로그인 라우트
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google 콜백 라우트
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    try {
      res.cookie('userEmail', req.user.email, {
        maxAge: 24 * 60 * 60 * 1000, // 1일
        httpOnly: true,             // 자바스크립트에서 접근 불가
        secure: process.env.NODE_ENV === 'production', // HTTPS에서만 쿠키 전송
        sameSite: 'None'            // Cross-site 쿠키 허용
      });

      res.redirect('/profile');
    } catch (error) {
      console.error('Login callback error:', error);
      res.redirect('/login');
    }
  }
);

// 프로필 페이지
app.get('/profile', isLoggedIn, (req, res) => {
  res.send(`
    <h1>프로필</h1>
    <p>이름: ${req.user.display_name}</p>
    <p>이메일: ${req.user.email}</p>
    <img src="${req.user.profile_picture}" alt="프로필 사진" width="100">
    <p><a href="/logout">로그아웃</a></p>
  `);
});

// 로그아웃
app.get('/logout', (req, res) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/login'); // 로그인 페이지로 리다이렉트
  });
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
});
