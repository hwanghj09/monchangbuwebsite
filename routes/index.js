const express = require('express');
const router = express.Router();

// '/' URL이 들어오면 'index'로 render
router.get('/', (req, res) => {
    res.render('index');
});

// '/index' URL이 들어오면 'index'로 render
router.get('/index', (req, res) => {
    res.render('index');
});

module.exports = router;