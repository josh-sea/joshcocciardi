# Weather App

A React Native weather application built with Expo that provides current weather conditions and forecasts with AI-powered natural language summaries.

## Features

- **Current Location & Multiple Locations**: Use GPS or enter zipcodes to get weather for any location
- **AI-Powered Summaries**: Natural language weather explanations powered by OpenAI
- **Multiple Timeframes**: View weather for now, today, tomorrow, this week, and weekend
- **Clean Interface**: Modern, intuitive design with interactive forecast navigation

## Setup

### Environment Variables

This app requires API keys for weather data and AI summaries. You'll need to set up your own API keys:

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your API keys:
   ```bash
   # Weather API Key (Pirate Weather)
   WEATHER_API_KEY=your_pirate_weather_api_key_here
   
   # OpenAI API Key
   OPENAI_API_KEY=your_openai_api_key_here
   ```

### Getting API Keys

1. **Pirate Weather API**: Sign up at [pirateweather.net](https://pirateweather.net) for weather data
2. **OpenAI API**: Get your key from [platform.openai.com](https://platform.openai.com) for AI summaries

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Follow the Expo instructions to run on your device or simulator

## Security

- API keys are stored in `.env` file (not committed to git)
- Never commit your actual API keys to version control
- Use `.env.example` as a template for others

## Technologies

- React Native with Expo
- OpenAI GPT-3.5-turbo for natural language summaries
- Pirate Weather API for weather data
- Expo Location for GPS functionality
- react-native-dotenv for environment variable management
