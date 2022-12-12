import * as cdk from 'aws-cdk-lib';
import * as asg from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecr from 'aws-cdk-lib/aws-ecr';

import { Construct } from 'constructs';

class AppStack extends cdk.Stack {
  private readonly APP = "woven-demo";
  private readonly IMAGE_VERSION = "latest";
  private readonly IMAGE_REPO = "woven-demo-app";
  private readonly CONTAINER_MEMORY_LIMIT = 128;
  private readonly CONTAINER_PORT = 3000;

  clusterSvc: ecs.Ec2Service;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);

      const vpc = ec2.Vpc.fromLookup(this, 'ImportVPC',{isDefault: true});
      
      let myALBSG = this.provisionALBSG(vpc);
      let myAGS = this.provisionASG(vpc, myALBSG);
      let clusterSvc = this.provisionECSClusterWithCapacity(vpc, myAGS);
      let myALB = this.provisionALB(vpc, myALBSG, clusterSvc);

      // CodeDeploy will need the service to deploy into
      //
      this.clusterSvc = clusterSvc;
  }

  private provisionECSClusterWithCapacity(vpc: ec2.IVpc, asg: asg.AutoScalingGroup) {
    const cluster = new ecs.Cluster(this, "DemoECSCluster", {
      vpc
    });

    // We're going to provide our own ASG
    cluster.addAsgCapacityProvider(
      new ecs.AsgCapacityProvider(this, 'DemoASGProvider', {
        autoScalingGroup: asg
      })
    );

    cdk.Tags.of(cluster).add("application", this.APP);

    // This hack should really be refactored out as we now need to provision
    //  ECR in a seperate stack -- probably just console for this demo
    //
    const appImage = ecs.ContainerImage.fromEcrRepository(
      ecr.Repository.fromRepositoryName(this, 'DemoECRImage', this.IMAGE_REPO), 
      this.IMAGE_VERSION);

    let taskDef = new ecs.Ec2TaskDefinition(this, "DemoECSTaskDef");
    taskDef.addContainer("DemoECSTaskDefContainer", {
      image: appImage,
      memoryLimitMiB: this.CONTAINER_MEMORY_LIMIT,
      portMappings: [{
        containerPort: this.CONTAINER_PORT,
        hostPort: 0  // We want dynamic port mapping enabled
      }],
      // Nice to have since the AMZN Linux ECS immage comes with CW Agent pre-installed
      //
      logging: ecs.LogDriver.awsLogs({ 
        streamPrefix: this.APP  
      }),
      // Necessary since our AGS is configured for EC2 health checks
      //
      healthCheck: {
        // Cheating here
        //
        command: [ "CMD-SHELL", "echo healthy || exit 1" ],
        interval: cdk.Duration.seconds(120),  
        startPeriod: cdk.Duration.minutes(2)
      }
    });

    cdk.Tags.of(taskDef).add("application", this.APP);

    let clusterSvc = new ecs.Ec2Service(this, 'DemoECSClusterEC2Service', {
      cluster: cluster,
      taskDefinition: taskDef,
      healthCheckGracePeriod: cdk.Duration.seconds(120)
    });

    cdk.Tags.of(clusterSvc).add("application", this.APP);

    return clusterSvc;
  }

  private provisionALBSG(vpc: ec2.IVpc) {
    let albSG = new ec2.SecurityGroup(this, "DemoALBSG", {
      vpc,
      allowAllOutbound: true
    });

    albSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80)
    )

    cdk.Tags.of(albSG).add("application", this.APP);

    return albSG; 
  }

  private provisionALB(vpc: ec2.IVpc, albSG: ec2.SecurityGroup, cluster: ecs.Ec2Service) {
    let alb = new elbv2.ApplicationLoadBalancer(this, "DemoALB", {
      vpc,
      internetFacing: true,
      securityGroup: albSG
    });

    cdk.Tags.of(alb).add("application", this.APP);

    let listener = alb.addListener("DemoALBListener", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80
    });

    listener.addTargets("DemoECSClusterTarget", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [cluster],
      healthCheck: {
        enabled: true,
        path: "/status",
        interval: cdk.Duration.seconds(120)
      }
    });
  } 

  private provisionASG(vpc: ec2.IVpc, albSG: ec2.SecurityGroup) {
      let instanceSG = new ec2.SecurityGroup(this, "DemoInstanceSG", {
        vpc,
        allowAllOutbound: true
      });

      instanceSG.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(22)
      )

      // We will be deploying to ECS using dynamic container port mapping
      //  so we will just open up the known range of ports here
      //
      instanceSG.connections.allowFrom(
        albSG, 
        ec2.Port.tcpRange(32768, 65535));

      cdk.Tags.of(instanceSG).add("application", this.APP);

      // AmazonEC2ContainerRegistryReadOnly - fetch image
      // 
      let instanceRole = new iam.Role(this, "demoInstanceRole", {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly')
        ]
      });

      cdk.Tags.of(instanceRole).add("application", this.APP);

      // We need an EcsOptimizedImage as we will be using this ASG for ECS
      //
      let myASG = new asg.AutoScalingGroup(this, "DemoASG", {
        vpc,
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.BURSTABLE2,
          ec2.InstanceSize.NANO
        ), 
        machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
        securityGroup: instanceSG,
        role: instanceRole,
        minCapacity: 1,
        maxCapacity: 2,
        desiredCapacity: 1,
        healthCheck: asg.HealthCheck.ec2()
      })

      cdk.Tags.of(myASG).add("application", this.APP);

      return myASG;
  }

};

export { AppStack }
