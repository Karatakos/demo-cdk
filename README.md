# Woven Demo CICD Project via CDK

## Deployment

Note: Only support GitHub repos

### Step 1. Prerequisites

1. Stacks generated via CDK synth including context for GitHub `cdk synth --context GH_REPO=myrepo --context GH_ACCOUNT_OWNER=owner --context GH_SECRET=secret`
1. `cdk deploy ResourcesStack` completed successfully -- provisions ECR repo
1. Initial image deployed to the new ECR repo. See app repo's README.md.

### Step 2. App Stack Deployed

App stack will deploy all application resources such as ASG, ALB and an ECS cluster

```
cdk deploy AppStack
```

### Step 3. Pipeline Stack Deployed

Pipeline stack will deploy `CodeBuild`, `CodeDeploy` and `CodePipline` along with supporting resources such as S3 asset buckets.

```
cdk deploy PipelineStack
```

## CDK Info

### Context

* Clearing context: `cdk context --clear`
* Setting GitHub repo context: `cdk synth --context GH_REPO=myrepo --context GH_ACCOUNT_OWNER=owner --context GH_SECRET=secret`

### Deleting stacks

``` 
cdk delete ResourcesStack
cdk delete AppStack
cdk delete PipelineStack
```