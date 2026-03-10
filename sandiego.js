import { PlaywrightCrawler } from 'crawlee'; // Using Crawlee (Apify's standard)

// 1. Get Input from your Deno call
const input = await KeyValueStore.getInput();
const { startDate, endDate } = input;

const crawler = new PlaywrightCrawler({
    async requestHandler({ page }) {
        // 2. Navigate to San Diego PDS
        await page.goto('https://publicservices.sandiegocounty.gov/CitizenAccess/Cap/CapHome.aspx?module=PDS&TabName=PDS');

        // 3. Expand Advanced Criteria
        const expandBtn = await page.$('img[alt="Expand"]');
        if (expandBtn) await expandBtn.click();

        // 4. Select 8002 - Residential Solar
        await page.selectOption('select[id*="SecondaryScopeCode1"]', '8002');

        // 5. Fill Dynamic Dates
        await page.fill('input[id*="txtSearchStartDate"]', startDate);
        await page.fill('input[id*="txtSearchEndDate"]', endDate);

        // 6. Execute Search
        await page.click('a[id*="btnSearch"]');

        // 7. Extract Results (Logic to loop through table and push to dataset)
        await page.waitForSelector('table[id*="gdvPermitList"]');
        const results = await page.$$eval('tr.gdvPermitList_Row', rows => {
            return rows.map(row => ({
                permitNumber: row.cells[1]?.innerText,
                date: row.cells[2]?.innerText,
                address: row.cells[4]?.innerText,
                description: row.cells[5]?.innerText,
            }));
        });

        await Dataset.pushData(results);
    },
});

await crawler.run();
