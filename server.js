const express = require("express");
const session = require("express-session");
const passport = require("passport");
const { Pool } = require("pg");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const path = require("path");

const app = express();

// Google OAuth 및 PostgreSQL 연결 정보
const GOOGLE_CLIENT_ID = '908214582199-sqsmujo3eb3utgn6jrhp95tspaallk2d.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const GOOGLE_CALLBACK_URL = 'https://monchangbuwebsite.onrender.com/auth/google/callback';

const DATABASE_URL = 'postgresql://hwanghj09:bGTMWup7u3rpjAcDasyainqTf37vRFnu@dpg-cv7ei1tumphs738hfiqg-a.oregon-postgres.render.com/mcb';
const SESSION_SECRET = 'mysecret';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 템플릿 엔진 설정 (EJS)
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));  // views 폴더 경로 설정

// 세션 설정
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// 구글 로그인 전략 설정
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    const { id, displayName, emails, photos } = profile;
    const email = emails[0].value;
    const picture = photos[0].value;

    try {
        const client = await pool.connect();
        const result = await client.query(
            "INSERT INTO users (google_id, email, name, picture) VALUES ($1, $2, $3, $4) ON CONFLICT (google_id) DO UPDATE SET name = $3, picture = $4 RETURNING *;",
            [id, email, displayName, picture]
        );
        client.release();
        done(null, result.rows[0]);
    } catch (err) {
        console.error(err);
        done(err, null);
    }
}));

// 로그인 후 사용자 정보 세션 저장
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// 세션에서 사용자 정보 복원
passport.deserializeUser(async (id, done) => {
    try {
        const client = await pool.connect();
        const result = await client.query("SELECT * FROM users WHERE id = $1;", [id]);
        client.release();
        done(null, result.rows[0]);
    } catch (err) {
        done(err, null);
    }
});

// Google OAuth 로그인 라우트
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback", passport.authenticate("google", {
    successRedirect: "/profile",
    failureRedirect: "/"
}));

// 프로필 페이지
app.get("/profile", (req, res) => {
    if (!req.isAuthenticated()) return res.redirect("/");
    res.render("profile", { user: req.user });
});

app.get("/", (req, res) => {
    res.render("index");
});

// '/index' URL이 들어오면 'index'로 render
app.get("/index", (req, res) => {
    res.render("index");
});

app.get("/calendar", (req, res) => {
    res.render("calendar");
});

// 로그아웃 처리
app.get("/logout", (req, res) => {
    req.logout(() => {
        res.redirect("/");
    });
});

// 서버 실행
app.listen(3000, () => console.log("✅ 서버가 http://localhost:3000 에서 실행 중!"));
