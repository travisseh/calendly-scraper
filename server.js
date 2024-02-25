const express = require('express');
const cors = require('cors'); // Require CORS package
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const app = express();
// Use the environment variable PORT provided by Heroku or fallback to 3001 for local development
const PORT = process.env.PORT || 3001;

// Middleware to set CORS headers as open as possible
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'OPTIONS'], // Allow all standard methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allow common headers
  credentials: true, // Allow cookies to be sent with requests
  optionsSuccessStatus: 204 // Some legacy browsers choke on status 200
}));
console.log("hello")
// Enable preflight requests for all routes
app.options('*', cors()); // Enable preflight across-the-board
// Logging middleware
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.path}`);
  next();
});

console.log("hi")

app.use(express.json());

app.use('/fetch-calendly', async (req, res) => {
  const { calendlyUrls } = req.body;

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu']
    });

    // Process each URL in parallel using Promise.all
    const allTimesByDayPromises = calendlyUrls.map(async (calendlyUrl) => {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.goto(calendlyUrl, { waitUntil: 'domcontentloaded' }); // Optimized waitUntil

      const availableDaysSelectors = await page.evaluate(() => {
        const selectors = [];
        document.querySelectorAll('button[aria-label*="- Times available"]').forEach(element => {
          selectors.push(element.getAttribute('aria-label'));
        });
        return selectors;
      });

      let timesByDayForUrl = {};

      for (const daySelector of availableDaysSelectors) {
        const datePart = daySelector.split(' - ')[0];

        await page.click(`button[aria-label="${daySelector}"]`);
        await page.waitForSelector('button[data-start-time]', { visible: true, timeout: 5000 }); // Optimized wait

        const availableTimes = await page.evaluate(() => {
          const times = [];
          document.querySelectorAll('button[data-start-time]').forEach(element => {
            times.push(element.textContent.trim());
          });
          return times;
        });

        if (!timesByDayForUrl[datePart]) {
          timesByDayForUrl[datePart] = new Set();
        }

        availableTimes.forEach(time => timesByDayForUrl[datePart].add(time));

        // Navigate back or close the page to start fresh for the next URL
        await page.goto('about:blank');
        await page.goto(calendlyUrl, { waitUntil: 'networkidle2' });
      }

      await page.close();
      return timesByDayForUrl;
    });

    const allTimesByDayArrays = await Promise.all(allTimesByDayPromises);
    await browser.close();

    // Intersect times for each day across all URLs
    const commonTimesByDay = allTimesByDayArrays.reduce((acc, timesByDay) => {
      Object.keys(timesByDay).forEach(day => {
        if (!acc[day]) {
          acc[day] = timesByDay[day];
        } else {
          acc[day] = new Set([...acc[day]].filter(time => timesByDay[day].has(time)));
        }
      });
      return acc;
    }, {});

    // Convert Set to Array for each day and prepare final structure
    const finalTimesByDay = Object.keys(commonTimesByDay).map(dayDate => ({
      dayDate,
      times: [...commonTimesByDay[dayDate]]
    }));

    console.log(`Deduplicated and grouped available times being sent to the front-end:`, finalTimesByDay);
    res.json({ availableTimes: finalTimesByDay });
  } catch (error) {
    console.error('Error fetching Calendly pages:', error);
    res.status(500).send('Error fetching Calendly pages');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});