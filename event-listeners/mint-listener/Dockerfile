# Use the official Node.js 20 image as the base image
FROM node:20

# Create and set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files to the working directory
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

# Define the command to run the application
CMD [ "npm", "run", "start" ]
