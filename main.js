async ({ page, request, input, log, Actor }) => {
    // 1. Initial Setup and Navigation
    log.info('Starting San Diego PDS Scrape...');
    await page.goto('https://publicservices.sandiegocounty.gov/CitizenAccess/Default.aspx', { waitUntil: 'networkidle' });

    // 2. Click "PDS"
    await page.click('a:has-text("PDS")');
    await page.waitForLoadState('networkidle');

    // 3. Handle Inputs (Dates from your API call)
    const { startDate, endDate } = input || { startDate: '03/01/2026', endDate: '03/10/2026' };
    log.info(`Searching from ${startDate} to ${endDate}`);
    
    await page.fill('input[id*="txtSearchStartDate"]', startDate);
    await page.fill('input[id*="txtSearchEndDate"]', endDate);

    // 4. Expand "Search additional criteria" and wait for fields
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.click('img[alt="Expand"]');
    log.info('Waiting 10s for additional criteria to populate...');
    await page.waitForTimeout(10000); 

    // 5. Select the 8002 Solar Code
    await page.selectOption('select[id*="SecondaryScopeCode1"]', { label: '8002 - REN - Solar Photovoltaic Roof Mount Residential - Online' });

    // 6. Click Search and wait for results
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.click('a[id*="btnSearch"]');
    await page.waitForSelector('tr.gdvPermitList_Row', { timeout: 60000 });

    // 7. Scrape the Initial Results Table
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

    log.info(`Found ${leads.length} records. Starting deep dive into details...`);

    // 8. Deep Dive into each record for the 4 specific Solar fields
    const finalResults = [];
    for (const lead of leads) {
        // Open a separate tab to keep the search session alive
        const detailPage = await page.context().newPage();
        try {
            const linkSelector = `a[id="${lead.linkId}"]`;
            const href = await page.getAttribute(linkSelector, 'href');
            const fullUrl = new URL(href, page.url()).href;
            
            await detailPage.goto(fullUrl, { waitUntil: 'networkidle' });

            // Navigation to Application Information
            await detailPage.click('a:has-text("More Details")');
            await detailPage.click('a:has-text("Application Information")');
            await detailPage.waitForSelector('div.appInfoTable', { timeout: 15000 });

            // Extract the target data points
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

            // Merge search results with the deep-dive data
            finalResults.push({ ...lead, ...appInfo });
        } catch (err) {
            log.error(`Could not get deep details for ${lead.recordId}: ${err.message}`);
            finalResults.push(lead); // Save the partial data so we don't lose the lead
        } finally {
            await detailPage.close();
        }
    }

    // 9. Save all combined data to the Apify Dataset
    await Actor.pushData(finalResults);
    log.info('Scrape completed successfully.');
}
