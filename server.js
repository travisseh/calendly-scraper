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
  const { calendlyUrl } = req.body;
  console.log(`Received request to fetch: ${calendlyUrl}`); // Log the requested URL

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(calendlyUrl, { waitUntil: 'networkidle2' });
    console.log(`Page loaded: ${calendlyUrl}`); // Confirm page load

    const availableDaysSelectors = await page.evaluate(() => {
      const selectors = [];
      document.querySelectorAll('button[aria-label*="- Times available"]').forEach(element => {
        selectors.push(element.getAttribute('aria-label'));
      });
      return selectors;
    });

    console.log(`Found ${availableDaysSelectors.length} days with available times.`); // Log the count of found days

    let allAvailableTimes = [];

    for (const daySelector of availableDaysSelectors) {
      console.log(`Processing day: ${daySelector}`); // Log the day being processed
      // Extract just the date part from the daySelector
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

      // Append the date part to each time slot
      const timesWithDate = availableTimes.map(time => `${datePart}, ${time}`);
      allAvailableTimes = allAvailableTimes.concat(timesWithDate);

      console.log(`Found ${availableTimes.length} times for ${daySelector}.`); // Log the count of times found for the day
      await page.goto(calendlyUrl, { waitUntil: 'networkidle2' }); // Navigate back for the next iteration
    }

    await browser.close();
    console.log(`Sending back ${allAvailableTimes.length} available times.`); // Log the total count of times being sent back
    // Log the entire response before sending it
    console.log(`Final response being sent to the front-end:`, { availableTimes: allAvailableTimes });
    res.json({ availableTimes: allAvailableTimes });
  } catch (error) {
    console.error('Error fetching Calendly page:', error);
    res.status(500).send('Error fetching Calendly page');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});