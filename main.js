import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput() || {};
const { startDate = '03/01/2026', endDate = '03/10/2026' } = input;

const results = [];

const crawler = new PlaywrightCrawler({
  launchContext: {
    launchOptions: { headless: true }
  },
  requestHandlerTimeoutSecs: 300,
  requestHandler: async ({ page, log }) => {
    log.info('Navigating to San Diego PDS...');
    await page.goto('https://publicservices.sandiegocounty.gov/CitizenAccess/Default.aspx', { 
      waitUntil: 'networkidle' 
    });

    await page.click('a:has-text("PDS")');
    await page.waitForLoadState('networkidle');

    await page.fill('input[id*="txtSearchStartDate"]', startDate);
    await page.fill('input[id*="txtSearchEndDate"]', endDate);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.click('img[alt="Expand"]');
    
    log.info('Waiting 10s for additional criteria...');
    await page.waitForTimeout(10000);

    await page.selectOption(
      'select[id*="SecondaryScopeCode1"]', 
      { label: '8002 - REN - Solar Photovoltaic Roof Mount Residential - Online' }
    );

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.click('a[id*="btnSearch"]');
    await page.waitForSelector('tr.gdvPermitList_Row', { timeout: 60000 });

    const leads = await page.$$eval('tr.gdvPermitList_Row', rows => {
      return rows.map(row => ({
        recordId: row.cells[1]?.innerText.trim(),
        openedDate: row.cells[2]?.innerText.trim(),
        recordType: row.cells[3]?.innerText.trim(),
        projectName: row.cells[4]?.innerText.trim(),
        address: row.cells[5]?.innerText.trim(),
        status: row.cells[6]?.innerText.trim(),
        action: row.cells[7]?.innerText.trim(),
        shortNotes: row.cells[8]?.innerText.trim(),
        linkId: row.querySelector('a')?.id
      }));
    });

    log.info(`Found ${leads.length} records. Getting details...`);

    for (const lead of leads) {
      const detailPage = await page.context().newPage();
      try {
        const href = await page.getAttribute(`a[id="${lead.linkId}"]`, 'href');
        const fullUrl = new URL(href, page.url()).href;

        await detailPage.goto(fullUrl, { waitUntil: 'networkidle' });
        await detailPage.click('a:has-text("More Details")');
        await detailPage.click('a:has-text("Application Information")');
        await detailPage.waitForSelector('div.appInfoTable', { timeout: 15000 });

        const appInfo = await detailPage.evaluate(() => {
          const getValue = (label) => {
            const spans = Array.from(document.querySelectorAll('span'));
            const target = spans.find(s => s.innerText.includes(label));
            return target ? target.parentElement.nextElementSibling?.innerText.trim() : 'N/A';
          };
          return {
            primaryScopeCode: getValue("Primary Scope Code"),
            kwSystemSize: getValue("Rounded Kilowatts Total System Size"),
            electricalUpgrade: getValue("Electrical Service Upgrade"),
            energyStorage: getValue("Advanced Energy Storage System")
          };
        });

        results.push({ ...lead, ...appInfo });
        log.info(`Processed ${lead.recordId}`);
      } catch (err) {
        log.error(`Failed detail for ${lead.recordId}: ${err.message}`);
        results.push(lead);
      } finally {
        await detailPage.close();
      }
    }

    await Actor.pushData(results);
    log.info(`Done. ${results.length} records saved.`);
  }
});

await crawler.run([
  'https://publicservices.sandiegocounty.gov/CitizenAccess/Default.aspx'
]);

await Actor.exit();
