const express = require("express");
const session = require("express-session");
const bodyParser = require('body-parser');
const passport = require("passport");
const { Pool } = require("pg");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const path = require("path");
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(cookieParser());

const SECRET_KEY = 'your-secret-key';

function encrypt(text) {
    const cipher = crypto.createCipher('aes-256-cbc', SECRET_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}


function decrypt(encrypted) {
    const decipher = crypto.createDecipher('aes-256-cbc', SECRET_KEY);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

const db = new Pool({
    user: 'hwanghj09',
    host: 'dpg-cv7ei1tumphs738hfiqg-a.oregon-postgres.render.com',
    database: 'mcb',
    password: 'bGTMWup7u3rpjAcDasyainqTf37vRFnu',
    port: 5432,
});

const GOOGLE_CLIENT_ID = '908214582199-sqsmujo3eb3utgn6jrhp95tspaallk2d.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const GOOGLE_CALLBACK_URL = 'https://monchangbuwebsite.onrender.com/auth/google/callback';

const DATABASE_URL = 'postgresql://hwanghj09:bGTMWup7u3rpjAcDasyainqTf37vRFnu@dpg-cv7ei1tumphs738hfiqg-a.oregon-postgres.render.com/mcb';
const SESSION_SECRET = 'mysecret';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static('views'));

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

passport.serializeUser((user, done) => {
    done(null, user.id);
});

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

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback", passport.authenticate("google", {
    successRedirect: "/",
    failureRedirect: "/profile"
}), (req, res) => {
    const encryptedName = encrypt(req.user.name);
    console.log("쿠키 저장 시도: ", encryptedName);

    res.cookie('userName', encryptedName, {
        maxAge: 900000,
        path: '/',
        httpOnly: false,
        secure: isProduction,
        sameSite: 'None'
    });

    res.redirect("/");
});


app.get("/", (req, res) => {
    res.render("index");
});

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

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ 서버가 http://127.0.0.1:${PORT} 에서 실행 중!`);
});
