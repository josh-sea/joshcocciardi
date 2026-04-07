#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Build Script for Converting all JSX files in a directory to Standalone HTML
 * 
 * Usage: node scripts/build-jsx-directory.js <directory>
 * 
 * This script finds all .jsx files in a directory and converts them to standalone HTML files.
 */

function buildDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        console.error(`❌ Error: Directory '${dirPath}' not found.`);
        process.exit(1);
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
        console.error(`❌ Error: '${dirPath}' is not a directory.`);
        process.exit(1);
    }

    // Find all .jsx files
    const files = fs.readdirSync(dirPath);
    const jsxFiles = files.filter(file => file.endsWith('.jsx'));

    if (jsxFiles.length === 0) {
        console.log(`⚠️  No .jsx files found in ${dirPath}`);
        return;
    }

    console.log(`\n📦 Building ${jsxFiles.length} JSX file(s) from ${dirPath}\n`);

    let successCount = 0;
    let errorCount = 0;

    jsxFiles.forEach(file => {
        const inputPath = path.join(dirPath, file);
        const outputPath = inputPath.replace(/\.jsx$/, '.html');

        try {
            execSync(`node scripts/build-jsx-app.js "${inputPath}" "${outputPath}"`, {
                stdio: 'inherit'
            });
            successCount++;
        } catch (error) {
            console.error(`❌ Failed to build ${file}`);
            errorCount++;
        }
    });

    console.log(`\n✨ Build complete!`);
    console.log(`   ✅ Success: ${successCount}`);
    if (errorCount > 0) {
        console.log(`   ❌ Errors: ${errorCount}`);
    }
}

// Process command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log(`
📦 JSX Directory Builder

Usage: node scripts/build-jsx-directory.js <directory>

Example:
  node scripts/build-jsx-directory.js public/apps

This will convert all .jsx files in the directory to .html files.
    `);
    process.exit(0);
}

const dirPath = args[0];
buildDirectory(dirPath);
