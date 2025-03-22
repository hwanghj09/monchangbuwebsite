const express = require("express");
const session = require("express-session");
const bodyParser = require('body-parser');
const passport = require("passport");
const { Pool } = require("pg");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const path = require("path");
const cors = require('cors');
const cookieParser = require('cookie-parser'); // Add cookie-parser
const crypto = require('crypto'); // For encryption and decryption

const app = express();
app.use(bodyParser.json());
app.use(cors()); // CORS 문제 방지
app.use(cookieParser()); // Use cookie-parser to handle cookies

const SECRET_KEY = 'your-secret-key'; // A secret key for encryption (must be kept safe)

// Function to encrypt data
function encrypt(text) {
    const cipher = crypto.createCipher('aes-256-cbc', SECRET_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

// Function to decrypt data
function decrypt(encrypted) {
    const decipher = crypto.createDecipher('aes-256-cbc', SECRET_KEY);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ✅ PostgreSQL 데이터베이스 연결 설정
const db = new Pool({
    user: 'hwanghj09', // PostgreSQL 사용자명
    host: 'dpg-cv7ei1tumphs738hfiqg-a.oregon-postgres.render.com', // DB 호스트
    database: 'mcb', // 데이터베이스 이름
    password: 'bGTMWup7u3rpjAcDasyainqTf37vRFnu', // 비밀번호
    port: 5432, // PostgreSQL 기본 포트
});

// Google OAuth 및 PostgreSQL 연결 정보
const GOOGLE_CLIENT_ID = '908214582199-sqsmujo3eb3utgn6jrhp95tspaallk2d.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const GOOGLE_CALLBACK_URL = 'https://monchangbuwebsite.onrender.com/auth/google/callback';

const DATABASE_URL = 'postgresql://hwanghj09:bGTMWup7u3rpjAcDasyainqTf37vRFnu@dpg-cv7ei1tumphs738hfiqg-a.oregon-postgres.render.com/mcb';
const SESSION_SECRET = 'mysecret';

// ✅ PostgreSQL 연결 설정 (db 대신 pool 사용)
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

app.use(express.static('views'));

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
    successRedirect: "/",
    failureRedirect: "/"
}), (req, res) => {
    res.cookie('userName', encrypt(req.user.name), { maxAge: 900000, httpOnly: true });
});


// 홈 페이지
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

app.get("/cal", (req, res) => {
    res.render("cal");
});

app.get("/test", (req, res) => {
    res.render("test");
});

app.get("/museum", (req, res) => {
    res.render("museum");
});

app.get("/member", (req, res) => {
    res.render("member");
});

app.get("/member2", (req, res) => {
    res.render("member2");
});

app.get("/logout", (req, res) => {
    req.logout(() => {
        res.clearCookie('userName');
        res.redirect("/");
    });
});

 
// 서버 실행
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ 서버가 http://127.0.0.1:${PORT} 에서 실행 중!`);
});
