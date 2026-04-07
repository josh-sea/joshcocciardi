#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Build Script for Converting JSX to Standalone HTML
 * 
 * Usage: node scripts/build-jsx-app.js <input.jsx> [output.html]
 * 
 * This script converts a JSX file into a standalone HTML file that can be deployed directly.
 */

function buildJSXApp(inputPath, outputPath) {
    // Read the JSX file
    if (!fs.existsSync(inputPath)) {
        console.error(`❌ Error: Input file '${inputPath}' not found.`);
        process.exit(1);
    }

    const jsxContent = fs.readFileSync(inputPath, 'utf8');
    
    // Generate the HTML template
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React App</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }
        #root {
            min-height: 100vh;
        }
        .loader {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-size: 20px;
            color: #666;
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="loader">Loading...</div>
    </div>

    <!-- React, ReactDOM, and Babel Standalone -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

    <!-- Your JSX Code -->
    <script type="text/babel">
${jsxContent}

        // Render the app
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>`;

    // Write the output file
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, html, 'utf8');
    console.log(`✅ Successfully created: ${outputPath}`);
    console.log(`📝 Original JSX: ${inputPath}`);
    console.log(`🚀 You can now deploy this HTML file!`);
}

// Process command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log(`
📦 JSX to HTML Builder

Usage: node scripts/build-jsx-app.js <input.jsx> [output.html]

Examples:
  node scripts/build-jsx-app.js public/apps/myapp.jsx
  node scripts/build-jsx-app.js public/apps/myapp.jsx public/apps/myapp.html
  
If output path is not specified, it will use the same name with .html extension.
    `);
    process.exit(0);
}

const inputPath = args[0];
const outputPath = args[1] || inputPath.replace(/\.jsx$/, '.html');

buildJSXApp(inputPath, outputPath);
