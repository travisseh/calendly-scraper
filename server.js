const express = require('express');
const cors = require('cors'); // Require CORS package
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3001;

// Define allowed origins
const allowedOrigins = ['https://calendly-travisseh.vercel.app', 'http://localhost:3000', 'https://calendly-phi.vercel.app'];

// Middleware to set CORS headers
app.use(cors({
  origin: ['https://calendly-phi.vercel.app', 'http://localhost:3000'], // Add all your allowed origins here
  optionsSuccessStatus: 200
}));

// Logging middleware
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.path}`);
  next();
});

app.use(express.json());

app.use('/', async (req, res) => {
  const { calendlyUrls } = req.body;

  try {
    const browser = await puppeteer.launch();

    const allTimesByDayPromises = calendlyUrls.map(async (calendlyUrl) => {
      const page = await browser.newPage();
      await page.goto(calendlyUrl, { waitUntil: 'networkidle2' });

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
        await page.waitForSelector('button[data-start-time]', { visible: true });

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

app.options('*', cors()); // Respond to preflight requests

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});