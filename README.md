# Graph Data Visualization Project

A web application for visualizing hierarchical graph data using D3.js and Vue.js, with a serverless backend powered by AWS.

## Overview

This project provides an interactive graph visualization tool that displays hierarchical data structures. It consists of:

- **Frontend**: Vue.js application with D3.js for graph rendering
- **Backend**: AWS Lambda functions and API Gateway
- **Database**: Amazon Neptune (Graph Database)
- **Infrastructure**: Defined and deployed using AWS CDK

## Prerequisites

- Node.js (v20 or newer)
- npm or yarn
- AWS Account with appropriate permissions
- AWS CLI installed and configured
- AWS CDK installed globally (`npm install -g aws-cdk`)
- IAM user with programmatic access and appropriate permissions:
  - AmazonS3FullAccess
  - AmazonAPIGatewayAdministrator
  - AmazonLambdaFullAccess
  - AWSCloudFormationFullAccess
  - AmazonNeptuneFullAccess
  - IAMFullAccess

## Project Setup

1. Clone the Repository

```bash
git clone <repository-url>
cd graph-data
```

2. Install Dependencies

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Install Infra dependencies
cd ../infra
npm install

3. Build Dependencies

# Build backend dependencies
cd backend
npm run build

# Build frontend dependencies
cd frontend
npm run build

# Build Infra dependencies
cd infra
npm run build

4. Infra Deployment
   The backend uses AWS CDK to define and deploy infrastructure.
   1. Bootstrap AWS CDK (First-time only)
   2. cd infra
   3. cdk bootstrap aws://YOUR_AWS_ACCOUNT_NUMBER/YOUR_AWS_REGION

Replace `YOUR_ACCOUNT_NUMBER` and `YOUR_REGION` with your AWS account number and preferred region.

After deployment, CDK will output the API Gateway URLs. Note these URLs to update your frontend environment variables.

5. Update Frontend Configuration

Update the `.env` file in the frontend directory with the API Gateway URLs from the previous step.

VITE_API_GATEWAY_ID=<api-gateway-id>
VITE_AWS_REGION=<aws-region>
VITE_ENVIRONMENT=<environment>

6. Build Front end again
   1. cd frontend
   2. npm run build
7. Deploy app
   1. cd infra
   2. npm run deploy

This creates a production build in the `dist` directory.

The frontend is automatically deployed to an S3 bucket by the CDK deployment.

 ## Testing

This project uses Vitest for unit testing. The tests cover component rendering, data fetching, and user interactions with the graph visualization.

### Running Tests

To run all tests:
```bash
npm run test
```
## Architecture

- **Frontend**: Vue.js + D3.js (hosted on S3)
- **API Gateway**: Provides RESTful endpoints
- **Lambda Functions**: 
  - Graph data retrieval (connects to Neptune)
  - Health check API
- **Neptune Database**: Stores graph data
- **S3**: Hosts the static frontend files

## Troubleshooting

### CORS Issues

If you encounter CORS errors:
1. Ensure your API Gateway has CORS enabled
2. Verify the correct origin is allowed in your API Gateway configuration
3. Redeploy your API after making changes

### Missing Dependencies

If you see errors about missing modules like 'gremlin':
1. Create a copy of node_modules from backend/
2. Paste in /backend/dist/

## Usage

1. Navigate to the frontend URL (S3 website URL in production)
2. The graph will automatically load and display your hierarchical data
3. Click on nodes to view details in a popup