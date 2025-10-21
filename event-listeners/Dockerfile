# Use the official Node.js 20 image as the base image
FROM node:20

# Create and set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json from mint-listener directory
COPY mint-listener/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files from mint-listener directory
COPY mint-listener/ .

# Compile TypeScript to JavaScript
RUN npm run build

# Define the command to run the application
CMD [ "npm", "run", "start" ]

