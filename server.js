const express = require('express');
const cors = require('cors'); // Require CORS package
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3001;

app.use(cors()); // Use CORS middleware to enable CORS
app.use(express.json());

app.post('/fetch-calendly', async (req, res) => {
  const { calendlyUrls } = req.body; // Expecting an array of URLs

  try {
    const browser = await puppeteer.launch();

    const allAvailableTimesPromises = calendlyUrls.map(async (calendlyUrl) => {
      const page = await browser.newPage();
      await page.goto(calendlyUrl, { waitUntil: 'networkidle2' });

      const availableDaysSelectors = await page.evaluate(() => {
        const selectors = [];
        document.querySelectorAll('button[aria-label*="- Times available"]').forEach(element => {
          selectors.push(element.getAttribute('aria-label'));
        });
        return selectors;
      });

      let timesForUrl = [];

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

        const timesWithDate = availableTimes.map(time => `${datePart}, ${time}`);
        timesForUrl = timesForUrl.concat(timesWithDate);

        await page.goto(calendlyUrl, { waitUntil: 'networkidle2' });
      }

      await page.close();
      return timesForUrl;
    });

    const allAvailableTimesArrays = await Promise.all(allAvailableTimesPromises);
    await browser.close();

    // Find the intersection of all arrays
    const commonAvailableTimes = allAvailableTimesArrays.reduce((accumulator, currentArray) => {
      if (accumulator.length === 0) {
        return currentArray;
      }
      return accumulator.filter(time => currentArray.includes(time));
    }, []);

    console.log(`Common available times being sent to the front-end:`, { availableTimes: commonAvailableTimes });
    res.json({ availableTimes: commonAvailableTimes });
  } catch (error) {
    console.error('Error fetching Calendly pages:', error);
    res.status(500).send('Error fetching Calendly pages');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});