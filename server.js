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

// ─── Short Link Map ───────────────────────────────────────────────────────────
// Add as many slug → URL pairs as you need.
// Visit yourdomain.com/<slug> to proxy that site.
const SHORT_LINKS = {
    'jobs':  'https://www.jobharder.com',
    'WNc3u': 'https://www.jobharder.com',
};

// ─── Helpers: URL detection & resolution ──────────────────────────────────────
function isUrl(str) {
    if (!str) return false;
    const trimmed = str.trim();
    return /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i.test(trimmed) ||
           /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/[^\s]*)?$/i.test(trimmed) ||
           trimmed.includes('shorturl.at/') ||
           trimmed.includes('bit.ly/');
}

async function resolveUrlAndMetadata(rawUrl) {
    let target = rawUrl.trim();
    if (!/^https?:\/\//i.test(target)) {
        target = 'https://' + target;
    }

    try {
        const resp = await axios.get(target, {
            timeout: 6000,
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,*/*',
            },
            validateStatus: (status) => status < 400
        });

        const finalUrl = resp.request?.res?.responseUrl || target;
        const html = typeof resp.data === 'string' ? resp.data : '';

        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const parsed = new URL(finalUrl);
        const defaultTitle = parsed.hostname.replace(/^www\./, '').split('.')[0];
        const title = titleMatch ? titleMatch[1].trim() : `${defaultTitle.toUpperCase()} - Official Website`;

        // Extract meta description
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                          html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
        const snippet = descMatch ? descMatch[1].trim() : `Official portal for ${parsed.hostname}. Explore features, updates, and more.`;

        return {
            finalUrl,
            searchTerm: parsed.hostname.replace(/^www\./, ''),
            title,
            snippet,
            favicon: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`,
            displayed_link: `${parsed.protocol}//${parsed.hostname}`
        };
    } catch (_) {
        try {
            const parsed = new URL(target);
            const hostClean = parsed.hostname.replace(/^www\./, '');
            return {
                finalUrl: target,
                searchTerm: hostClean,
                title: `${hostClean.split('.')[0].toUpperCase()} - Official Website`,
                snippet: `Visit ${parsed.hostname} for more information and updates.`,
                favicon: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`,
                displayed_link: target
            };
        } catch (e) {
            return null;
        }
    }
}

// ─── Route: Homepage ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.render('index', { query: '' });
});

// ─── Route: Search Results (Masking Engine) ───────────────────────────────────
app.get('/search', async (req, res) => {
    const rawQuery = req.query.q ? req.query.q.trim() : '';

    if (!rawQuery) return res.redirect('/');

    let apiSearchQuery = rawQuery;
    let injectedResult = null;

    // If user searched for a URL or shortlink (e.g. shorturl.at/WNc3u or jobharder.com)
    if (isUrl(rawQuery)) {
        const resolved = await resolveUrlAndMetadata(rawQuery);
        if (resolved) {
            injectedResult = {
                title: resolved.title,
                link: resolved.finalUrl,
                displayed_link: resolved.displayed_link,
                snippet: resolved.snippet,
                favicon: resolved.favicon
            };
            // Search Google for the target domain rather than the raw shortlink string
            apiSearchQuery = resolved.searchTerm || rawQuery;
        }
    }

    try {
        const response = await axios.get('https://serpapi.com/search', {
            params: {
                q:             apiSearchQuery,
                engine:        'google',
                google_domain: 'google.com',
                gl:            'us',   // Geographical location target
                hl:            'en',   // Language target
                api_key:       process.env.SERPAPI_KEY,
            },
            timeout: 10_000,
        });

        let organicResults      = response.data.organic_results    || [];
        const relatedSearches   = response.data.related_searches   || [];
        const searchInformation = response.data.search_information || {};

        // If we resolved a custom URL or shortlink, place it prominently as the #1 result
        if (injectedResult) {
            // Remove exact duplicate if SerpApi already returned it
            organicResults = organicResults.filter(item => item.link !== injectedResult.link);
            organicResults.unshift(injectedResult);
        }

        res.render('search', {
            query:           rawQuery,
            results:         organicResults,
            relatedSearches,
            searchInfo:      searchInformation,
            error:           null,
        });

    } catch (err) {
        console.error('[Search Handler Error]', err.message);

        // Even if SerpApi fails or quota is exhausted, if we have the injected URL result, display it!
        if (injectedResult) {
            return res.render('search', {
                query:           rawQuery,
                results:         [injectedResult],
                relatedSearches: [],
                searchInfo:      { total_results: '1', time_taken_displayed: '0.12' },
                error:           null,
            });
        }

        res.render('search', {
            query:           rawQuery,
            results:         [],
            relatedSearches: [],
            searchInfo:      {},
            error:           'Could not retrieve live results. Please try again shortly.',
        });
    }
});

// ─── Route: Short Link Proxy ──────────────────────────────────────────────────
// Fetches the target page server-side and streams it back so YOUR domain
// stays in the visitor's URL bar — the destination site is never shown.
app.get('/:slug', async (req, res, next) => {
    let target = SHORT_LINKS[req.params.slug];

    // If slug is not in local map, check if it's a shorturl.at link
    if (!target) {
        target = `https://shorturl.at/${req.params.slug}`;
    }

    try {
        const upstream = await axios.get(target, {
            timeout: 10_000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,*/*',
            },
            maxRedirects: 5,
        });

        const contentType = upstream.headers['content-type'] || 'text/html';
        res.setHeader('Content-Type', contentType);
        res.send(upstream.data);

    } catch (err) {
        console.error(`[Proxy Error] ${target} →`, err.message);
        // Fall through to 404 if not found
        next();
    }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n  ✅  Server running → http://localhost:${PORT}\n`);
});

