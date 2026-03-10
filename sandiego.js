// Inside your crawler loop...
const initialData = await page.$$eval('tr.gdvPermitList_Row', rows => {
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

for (const lead of initialData) {
    // 1. Click the Record ID to enter the Detail View
    await page.click(`a[id="${lead.linkId}"]`);
    await page.waitForSelector('a[title="Record Info"]');

    // 2. Navigate to "Application Information"
    // Usually found under Record Info dropdown or as a sub-tab
    await page.click('a:has-text("Record Info")');
    await page.click('a:has-text("Application Information")');
    await page.waitForSelector('div.appInfoTable'); // Wait for the data table

    // 3. Extract your specific Solar & Electrical fields
    const deepDetails = await page.evaluate(() => {
        const getVal = (label) => document.querySelector(`span:has-text("${label}")`)?.parentElement?.nextElementSibling?.innerText;
        return {
            primaryScopeCode: getVal("Primary Scope Code"),
            kwSystemSize: getVal("Rounded Kilowatts Total System Size"),
            electricalUpgrade: getVal("Electrical Service Upgrade"),
            energyStorage: getVal("Advanced Energy Storage System")
        };
    });

    // 4. Merge and Save
    await Dataset.pushData({ ...lead, ...deepDetails });

    // 5. Return to Search Results
    await page.goBack(); 
    await page.waitForSelector('table[id*="gdvPermitList"]');
}
