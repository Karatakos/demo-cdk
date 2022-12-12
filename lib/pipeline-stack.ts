import * as cdk from 'aws-cdk-lib';
import * as cp from 'aws-cdk-lib/aws-codepipeline';
import * as cpactions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cb from 'aws-cdk-lib/aws-codebuild';
import * as ecs from 'aws-cdk-lib/aws-ecs';

import { Construct } from 'constructs';

class PipelineStack extends cdk.Stack {
  private readonly APP = "woven-demo";

  clusterSvc: ecs.Ec2Service;

  constructor(scope: Construct, id: string, clusterSvc: ecs.Ec2Service, props?: cdk.StackProps) {
    super(scope, id, props);

    this.clusterSvc = clusterSvc;

    this.provisionPipeline(props);
  }

  provisionPipeline(props?: cdk.StackProps) {
    const pipeline = new cp.Pipeline(this, 'DemoCodePipeline', {
      crossAccountKeys: false,
    });

    cdk.Tags.of(pipeline).add("application", this.APP);

    const sourceOutput = new cp.Artifact();
    const buildOutput = new cp.Artifact();

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new cpactions.GitHubSourceAction({
          actionName: 'DemoGitHubSourceAction',
          owner: String(this.node.tryGetContext('GH_ACCOUNT_OWNER')),
          repo: String(this.node.tryGetContext('GH_REPO')),
          oauthToken: new cdk.SecretValue(String(this.node.tryGetContext('GH_SECRET'))),
          output: sourceOutput,
          trigger: cpactions.GitHubTrigger.WEBHOOK,
          branch: 'main'
        })
      ]
    });

    const serviceRole = new iam.Role(this, 'DemoCodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com')
    });

    serviceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:GetAuthorizationToken",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",

          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",

          "s3:ListObjects",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:PutObject"
        ],
        resources: ['*'],
        effect: iam.Effect.ALLOW
      })
    );

    const buildProject = new cb.PipelineProject(this, "TsukeAssets-CodeBuild-Action", {
      role: serviceRole.withoutPolicyUpdates(),
      environment: {
        buildImage: cb.LinuxBuildImage.STANDARD_4_0,
        computeType: cb.ComputeType.SMALL,
        privileged: true
      },
      environmentVariables: {
        AWS_DEFAULT_REGION: {
          value: props?.env?.region
        },
        AWS_ACCOUNT_ID: {
          value: props?.env?.account
        }
      },
      // This really should be a YML file in the app repo
      //
      buildSpec: cb.BuildSpec.fromObjectToYaml({
        version: 0.2,
        phases: {
          install: {
            commands: [
              "n 14.16.1"
            ]
          },
          pre_build: {
            commands: [
              "echo 'Running tests'",
              "npm install",
              "npm run test",
              "echo 'Logging into Amazon ECR'",
              "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com"
            ]
          },
          build: {
            commands: [
              "echo 'Building the docker image'",
              "docker build -t $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com/woven-demo-app:latest -f Dockerfile ."
            ]
          },
          post_build: {
            commands: [
              "echo 'Build complete'",
              "echo 'Pushing the docker image'",
              "docker push $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com/woven-demo-app:latest",
              "echo 'Generating imagedefinition.json for ECS deploy stage'",
              "echo '[{\"name\":\"DemoECSTaskDefContainer\",\"imageUri\":\"'$AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com/woven-demo-app:latest'\"}]' > imagedefinitions.json"
            ]
          }
        },
        artifacts: {
          files: [
            'imagedefinitions.json'
          ]
        }
      }),
      logging: {
        cloudWatch: {
          logGroup: new logs.LogGroup(this, `DemoCodeBuildLogs`),
        }
      }
    });

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new cpactions.CodeBuildAction({
          actionName: 'DemoCodeBuildAction',
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput]
        })
      ]
    });

    pipeline.addStage({
      stageName: "Deploy",
      actions: [
        new cpactions.EcsDeployAction({
          actionName: "DemoCodeDeployAction",
          input: buildOutput,
          service: this.clusterSvc
        })
      ]
    });
  }
};

export { PipelineStack }
