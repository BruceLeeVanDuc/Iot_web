const path = require('path');
const express = require('express');

// Load environment variables
require('dotenv').config();

const apiRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API routes
app.use('/api', apiRoutes);

// Static FE
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Root -> public/index.html
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


