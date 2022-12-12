import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';

import { Construct } from 'constructs';

class ResourcesStack extends cdk.Stack {
    private readonly APP = "woven-demo";
    private readonly IMAGE_REPO = "woven-demo-app";
  
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
  
        const repository = new ecr.Repository(this, "DemoECRRepo", {
            repositoryName: this.IMAGE_REPO
        });

        cdk.Tags.of(repository).add("application", this.APP);
    }
}

export { ResourcesStack };