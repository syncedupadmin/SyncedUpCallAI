#!/usr/bin/env node
// ws-listen.mjs - Node SSE client with timestamps
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
function loadEnv() {
    const envPath = join(__dirname, '.env');
    const envExamplePath = join(__dirname, '.env.example');
    
    try {
        const envContent = readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    process.env[key.trim()] = valueParts.join('=').trim();
                }
            }
        });
    } catch (err) {
        console.error('Error: .env not found. Copy .env.example to .env and configure it.');
        process.exit(1);
    }
}

// EventSource polyfill for Node.js
class SimpleEventSource {
    constructor(url) {
        this.url = url;
        this.listeners = {};
        this.readyState = 0; // CONNECTING
    }

    addEventListener(event, handler) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(handler);
    }

    async connect() {
        try {
            this.readyState = 1; // OPEN
            const response = await fetch(this.url, {
                headers: { 'Accept': 'text/event-stream' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        const eventType = line.slice(6).trim();
                        // Next line should be data
                        const nextIndex = lines.indexOf(line) + 1;
                        if (nextIndex < lines.length && lines[nextIndex].startsWith('data:')) {
                            const data = lines[nextIndex].slice(5).trim();
                            this.emit(eventType, { data });
                        }
                    } else if (line.startsWith('data:')) {
                        const data = line.slice(5).trim();
                        this.emit('message', { data });
                    }
                }
            }
        } catch (err) {
            this.readyState = 2; // CLOSED
            this.emit('error', err);
        }
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(handler => handler(data));
        }
    }

    close() {
        this.readyState = 2; // CLOSED
    }
}

// Main function
async function main() {
    loadEnv();

    const APP_URL = process.env.APP_URL;
    if (!APP_URL) {
        console.error('Error: APP_URL must be set in .env');
        process.exit(1);
    }

    const callId = process.argv[2];
    if (!callId) {
        console.error('Usage: node ws-listen.mjs <call_id>');
        console.error('Example: node ws-listen.mjs abc123-def456');
        process.exit(1);
    }

    const url = `${APP_URL}/api/ui/stream/${callId}`;
    console.log(`Connecting to SSE stream for call: ${callId}`);
    console.log(`URL: ${url}`);
    console.log('Press Ctrl+C to stop\n');
    console.log('---');

    const eventSource = new SimpleEventSource(url);

    // Add event listeners
    eventSource.addEventListener('status', (event) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] EVENT: status`);
        
        try {
            const data = JSON.parse(event.data);
            console.log(`  Status: ${data.status}`);
            
            // Format status messages
            switch (data.status) {
                case 'queued':
                    console.log('  ⏳ Call queued for processing');
                    break;
                case 'transcribing':
                    console.log('  🎤 Transcription in progress...');
                    if (data.engine) console.log(`    Engine: ${data.engine}`);
                    break;
                case 'analyzing':
                    console.log('  🤖 Analysis in progress...');
                    if (data.stage) console.log(`    Stage: ${data.stage}`);
                    break;
                case 'done':
                    console.log('  ✅ Processing complete!');
                    if (data.transcribed) console.log('    Transcribed: Yes');
                    if (data.analyzed) console.log('    Analyzed: Yes');
                    if (data.engine) console.log(`    Engine: ${data.engine}`);
                    if (data.lang) console.log(`    Language: ${data.lang}`);
                    setTimeout(() => {
                        console.log('\nStream ended. Exiting...');
                        process.exit(0);
                    }, 1000);
                    break;
                case 'error':
                    console.log('  ❌ Error occurred during processing');
                    if (data.message) console.log(`    Error: ${data.message}`);
                    break;
            }
            
            // Log additional data
            if (data.details) {
                console.log(`  Details: ${JSON.stringify(data.details, null, 2)}`);
            }
        } catch (err) {
            console.log(`  Raw data: ${event.data}`);
        }
        console.log('');
    });

    eventSource.addEventListener('error', (err) => {
        console.error('Connection error:', err.message || err);
        process.exit(1);
    });

    eventSource.addEventListener('message', (event) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] MESSAGE: ${event.data}`);
    });

    // Connect and start listening
    await eventSource.connect();
}

// Run the script
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});