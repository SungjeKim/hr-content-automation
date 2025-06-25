const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

app.get('/', (req, res) => {
  res.send('Minimal server working!');
});

server.listen(PORT, () => {
  console.log(`Minimal server running on port ${PORT}`);
});