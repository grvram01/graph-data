import {
  RemovalPolicy,
  Stack,
  StackProps,
  Duration,
  aws_apigateway as apigateway,
  aws_rds as awsRDS,
  aws_s3 as s3,
  CfnOutput
} from 'aws-cdk-lib';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { RestApi, LambdaIntegration, Cors } from 'aws-cdk-lib/aws-apigateway';
import { CfnDBCluster, CfnDBInstance } from 'aws-cdk-lib/aws-neptune';
import * as path from 'path';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs'
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class GraphVisualizationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const vpc = new ec2.Vpc(this, 'NeptuneVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC, // Add public subnet for NAT gateway
        },
      ],
    });
    // Create Security Groups
    const neptuneSecurityGroup = new ec2.SecurityGroup(this, 'NeptuneSecurityGroup', {
      vpc,
      description: 'Security group for Neptune cluster',
    });
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, "LambdaSecurityGroup", {
      vpc,
      description: "Security group for lambda function"
    });
    const dbSubnetGroup = new awsRDS.CfnDBSubnetGroup(this, "NeptuneSubnetGroup", {
      dbSubnetGroupDescription: "subnet group for neptune",
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId)
    });

    if (vpc.privateSubnets.length < 2) {
      throw new Error('Neptune requires at least 2 subnets in different Availability Zones');
    }
    // Create Neptune cluster.
    const neptuneCluster = new CfnDBCluster(this, 'NeptuneCluster', {
      // vpc,
      dbClusterIdentifier: 'graph-viz-cluster',
      engineVersion: '1.2.1.0',
      vpcSecurityGroupIds: [neptuneSecurityGroup.securityGroupId],
      dbSubnetGroupName: dbSubnetGroup.ref,
    });

    neptuneSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(8182),
      'Allow Lambda to access Neptune'
    );

    // Create Neptune instance. Using db.t4g.medium which is eligible for free tier.
    const neptuneInstance = new CfnDBInstance(this, 'NeptuneInstance', {
      dbInstanceIdentifier: 'graph-viz-instance',
      dbInstanceClass: 'db.t4g.medium',  // Changed to db.t4g.medium
      dbClusterIdentifier: neptuneCluster.ref,
    });
    // Make sure instance is created after cluster
    neptuneInstance.addDependsOn(neptuneCluster);

    // Create API Lambda function.
    const initService = new Function(this, 'initServiceLambda', {
      runtime: Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, // Match the subnet type from VPC config
      environment: {
        NEPTUNE_ENDPOINT: neptuneCluster.attrEndpoint,
        NEPTUNE_PORT: '8182', // Neptune listens on 8182 by default.
      },
      timeout: Duration.seconds(30),
      securityGroups: [lambdaSecurityGroup],
    });

    const logGroup = new logs.LogGroup(this, 'ApiFunctionLogGroup', {
      logGroupName: `/aws/lambda/${initService.functionName}`, // Use the correct naming pattern
      removalPolicy: RemovalPolicy.DESTROY, // Or RETAIN, depending on your needs
    });

    // Grant the Lambda function permissions to the log group
    initService.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents'
        ],
        // resources: [logGroup.logGroupArn], // Use the log group's ARN
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/*`]
      })
    );

    // Grant Neptune access permissions to the Lambda
    const neptuneClusterResourceId = `cluster:${neptuneCluster.ref}`; // Construct resource ID
    initService.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "neptune-db:connect",
          "neptune-db:ReadDataViaQuery",
          "neptune-db:WriteDataViaQuery", // Needed for PUT requests
        ],
        resources: [
          `arn:aws:neptune-db:${this.region}:${this.account}:${neptuneClusterResourceId}/*`, // Correct ARN format
        ],
      })
    );
    // Create API Gateway
    const api = new RestApi(this, 'GraphApi', {
      restApiName: 'Graph Visualization API',
      description: 'API for graph visualization',
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
      },
    });

    initService.addPermission('ApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: api.arnForExecuteApi('GET', '/api/health'),
    });

    const requestValidator = new apigateway.RequestValidator(this, 'RequestValidator', {
      restApi: api,
      validateRequestBody: false,
      validateRequestParameters: true,
    });

    const websiteBucket = new s3.Bucket(this, 'GraphDataUIBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html', // SPA routing support
      publicReadAccess: true, // Make bucket public
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Deploy website files to S3
    new s3deploy.BucketDeployment(this, 'DeployGraphDataUI', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: websiteBucket,
    });

    // Output the S3 website URL
    new CfnOutput(this, 'GraphVisualisationUIURL', {
      value: websiteBucket.bucketWebsiteUrl,
      description: 'The URL of the website',
    });


    // Add API resources and methods
    const apiResource = api.root.addResource('api');

    const graphResource = apiResource.addResource('graph');
    graphResource.addMethod('GET', new LambdaIntegration(initService));

    const healthResource = apiResource.addResource('health');
    healthResource.addMethod('GET', new LambdaIntegration(initService), {
      requestValidator,
      authorizationType: apigateway.AuthorizationType.NONE,
    });
  }
}