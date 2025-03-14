const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://hwanghj09:bGTMWup7u3rpjAcDasyainqTf37vRFnu@dpg-cv7ei1tumphs738hfiqg-a.oregon-postgres.render.com/mcb',
    ssl: { rejectUnauthorized: false } // Render 사용 시 필요
});

client.connect()
    .then(() => console.log("✅ PostgreSQL 연결 성공!"))
    .catch(err => console.error("❌ PostgreSQL 연결 실패!", err));

module.exports = client;

//이거 어떻게해어떻게해어떻게해어떻게해
