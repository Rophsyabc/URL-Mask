require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;


// ─── Middleware ───────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Route: Homepage ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.render('index', { query: '' });
});

// ─── Route: Search Results (Masking Engine) ───────────────────────────────────
app.get('/search', async (req, res) => {
    const query = req.query.q ? req.query.q.trim() : '';

    if (!query) return res.redirect('/');

    try {
        const response = await axios.get('https://serpapi.com/search', {
            params: {
                q:             query,
                engine:        'google',
                google_domain: 'google.com',
                gl:            'us',   // Geographical location target
                hl:            'en',   // Language target
                api_key:       process.env.SERPAPI_KEY,
            },
            timeout: 10_000, // 10-second hard timeout — avoids hanging requests
        });

        const organicResults    = response.data.organic_results    || [];
        const relatedSearches   = response.data.related_searches   || [];
        const searchInformation = response.data.search_information || {};

        res.render('search', {
            query,
            results:         organicResults,
            relatedSearches,
            searchInfo:      searchInformation,
            error:           null,
        });

    } catch (err) {
        // ── Detailed diagnostics ──────────────────────────────────────────────
        console.error('\n[SerpApi Error] ─────────────────────────────────');
        console.error('  Message :', err.message);
        console.error('  Code    :', err.code);                          // e.g. ECONNREFUSED, ETIMEDOUT
        if (err.response) {
            // Server replied with a non-2xx status
            console.error('  Status  :', err.response.status);
            console.error('  Body    :', JSON.stringify(err.response.data, null, 2));
        } else if (err.request) {
            // Request was made but no response received (network/timeout)
            console.error('  → No response received — likely a network or timeout issue.');
        }
        console.error('─────────────────────────────────────────────────\n');

        // Graceful degradation — never crash in production
        res.render('search', {
            query,
            results:         [],
            relatedSearches: [],
            searchInfo:      {},
            error:           'Could not retrieve live results. Please try again shortly.',
        });
    }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n  ✅  Server running → http://localhost:${PORT}\n`);
});

