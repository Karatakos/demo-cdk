#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ResourcesStack } from '../lib/resources-stack';
import { AppStack } from '../lib/app-stack';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

const resourceStack = new ResourcesStack(app, 'ResourcesStack', {
    env: { 
        account: process.env.CDK_DEFAULT_ACCOUNT, 
        region: process.env.CDK_DEFAULT_REGION}
});

const appStack = new AppStack(app, 'AppStack', {
    env: { 
        account: process.env.CDK_DEFAULT_ACCOUNT, 
        region: process.env.CDK_DEFAULT_REGION}
});

const pipelineStack = new PipelineStack(app, 'PipelineStack', appStack.clusterSvc, {
    env: { 
        account: process.env.CDK_DEFAULT_ACCOUNT, 
        region: process.env.CDK_DEFAULT_REGION} 
});
