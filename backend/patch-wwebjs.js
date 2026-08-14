/**
 * patch-wwebjs.js
 * Automatically runs after 'npm install' to ensure whatsapp-web.js has the
 * latest Chrome User-Agent, safe ClientInfo evaluate, and resilient initialization hooks on any environment.
 */
const fs = require('fs');
const path = require('path');

const clientPath = path.join(__dirname, 'node_modules', 'whatsapp-web.js', 'src', 'Client.js');
const constantsPath = path.join(__dirname, 'node_modules', 'whatsapp-web.js', 'src', 'util', 'Constants.js');

try {
    if (fs.existsSync(constantsPath)) {
        let content = fs.readFileSync(constantsPath, 'utf8');
        // Update userAgent to Chrome 125
        if (content.includes('Chrome/101.0.4951.67')) {
            content = content.replace(
                /Mozilla\/5\.0 \(Macintosh; Intel Mac OS X 10_14_0\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/101\.0\.4951\.67 Safari\/537\.36/g,
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
            );
            fs.writeFileSync(constantsPath, content, 'utf8');
            console.log('✅ Patched whatsapp-web.js Constants.js (User-Agent)');
        }
    }

    if (fs.existsSync(clientPath)) {
        let client = fs.readFileSync(clientPath, 'utf8');
        let modified = false;

        // Fix goto waitUntil to domcontentloaded & block heavy media/fonts for low memory footprint
        if (client.includes("await page.goto(WhatsWebURL")) {
            if (!client.includes('setRequestInterception')) {
                client = client.replace(
                    "await page.goto(WhatsWebURL",
                    `try {
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const rt = req.resourceType();
                if (['media', 'font'].includes(rt)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
        } catch(e) {}
        await page.goto(WhatsWebURL`
                );
                modified = true;
            }
        }

        if (client.includes("waitUntil: 'load'")) {
            client = client.replace("waitUntil: 'load'", "waitUntil: 'domcontentloaded'");
            modified = true;
        }

        // Fix version check error suppression
        if (client.includes("while (start > Date.now() - timeout) {\n            version = await this.pupPage.evaluate('window.Debug?.VERSION');")) {
            client = client.replace(
                "while (start > Date.now() - timeout) {\n            version = await this.pupPage.evaluate('window.Debug?.VERSION');",
                "while (start > Date.now() - timeout) {\n            try { version = await this.pupPage.evaluate('window.Debug?.VERSION'); } catch(e) {}"
            );
            modified = true;
        }

        // Fix ClientInfo evaluation so missing modules during sync do not crash before emitting READY
        if (client.includes("window.require('WAWebUserPrefsMeUser').getMaybeMePnUser()")) {
            client = client.replace(
                /this\.info = new ClientInfo\(\s*this,\s*await this\.pupPage\.evaluate\(\(\) => \{[\s\S]*?\}\),\s*\);/m,
                `this.info = new ClientInfo(
                        this,
                        await this.pupPage.evaluate(() => {
                            try {
                                const conn = window.require('WAWebConnModel')?.Conn?.serialize?.() || {};
                                const userPrefs = window.require('WAWebUserPrefsMeUser');
                                const wid = userPrefs?.getMaybeMePnUser?.() || userPrefs?.getMaybeMeLidUser?.() || null;
                                return { ...conn, wid };
                            } catch (e) {
                                return { wid: null };
                            }
                        }),
                    );`
            );
            modified = true;
        }

        if (modified) {
            fs.writeFileSync(clientPath, client, 'utf8');
            console.log('✅ Patched whatsapp-web.js Client.js (Lifecycle & Sync)');
        }
    }
} catch (err) {
    console.warn('⚠️  Could not run patch-wwebjs:', err.message);
}

