
const express = require('express');
const path = require('path');
const routes = require('./routes/index');
const app = express();

// view engine 템플릿 사용을 명시
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use('/', routes); // index.js에서 라우팅 처리
app.use('/index', routes); // index.js에서 라우팅 처리

app.use('/', routes); // calendar.js에서 라우팅 처리
app.use('/calendar', routes); // calendar.js에서 라우팅 처리

app.listen(3000, () => {
    console.log('서버가 3000번 포트에서 실행 중입니다!');
});
