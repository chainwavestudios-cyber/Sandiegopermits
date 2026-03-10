import { PlaywrightCrawler, Dataset } from 'crawlee';

const crawler = new PlaywrightCrawler({
    // This is where 'page' comes from!
    async requestHandler({ page }) {
        
        // 1. You must navigate to the page first
        await page.goto('https://publicservices.sandiegocounty.gov/CitizenAccess/Cap/CapHome.aspx?module=PDS&TabName=PDS');

        // ... (Your code to select 8002 and enter dates goes here) ...

        // 2. Now your initialData code will work
        const initialData = await page.$$eval('tr.gdvPermitList_Row', rows => {
            return rows.map(row => ({
                recordId: row.cells[1]?.innerText.trim(),
                address: row.cells[5]?.innerText.trim(),
                linkId: row.querySelector('a')?.id
            }));
        });

        // Continue with your loop...
    },
});

await crawler.run();
