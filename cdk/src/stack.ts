import {
    App,
    aws_certificatemanager as acm,
    aws_cloudfront as cf,
    aws_route53 as route53,
    aws_route53_targets as targets,
    aws_s3 as s3,
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
    StackProps,
} from "aws-cdk-lib";
import {Construct} from "constructs";
import {S3Origin} from "aws-cdk-lib/aws-cloudfront-origins";
import {Role} from "aws-cdk-lib/aws-iam";

const STACK_NAME = process.env.STACK_NAME!;
const DOMAIN_NAME = process.env.DOMAIN_NAME!;
const PARENT_HOSTED_ZONE_EDITOR_ROLE_ARN = process.env.PARENT_HOSTED_ZONE_EDITOR_ROLE_ARN!;


export class ProjectStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Create bucket for static web content
        const wwwBucket = new s3.Bucket(this, "wwwBucket", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        new CfnOutput(this, "wwwBucketName", {value: wwwBucket.bucketName});


        // Create a "delegated aka "sub" DNS hosted zone specifically for this stack
        // This means that this stack has its own hosted zone where it can edit its own DNS records
        const projectDomainName = STACK_NAME + "." + DOMAIN_NAME;
        const projectHostedZone = new route53.PublicHostedZone(this, "subHostedZone", {zoneName: projectDomainName});

        // Create DNS (nameserver) records in the parent zone which point to this sub zone
        // To perform this task, we must assume a specific role provided by the parent account
        const parentHostedZoneEditorRole = Role.fromRoleArn(this, "parentHostedZoneEditorRole", PARENT_HOSTED_ZONE_EDITOR_ROLE_ARN);
        new route53.CrossAccountZoneDelegationRecord(this, "subHostedZoneDelegate", {
            delegatedZone: projectHostedZone,
            parentHostedZoneName: DOMAIN_NAME,
            delegationRole: parentHostedZoneEditorRole,
        });


        // Create SSL certificate, used by Cloudfront distribution
        // Cloudformation will pause deployment until the domain has been validated using DNS records
        // This is all handled automatically by the Cloudformation runtime
        const certificate = new acm.DnsValidatedCertificate(this, "certificate", {
            domainName: projectDomainName,
            hostedZone: projectHostedZone,
            region: "us-east-1",
        });


        // Create Cloudfront Distribution
        const wwwDistribution = new cf.Distribution(this, "wwwDistribution", {
            defaultRootObject: "index.html",

            defaultBehavior: {
                origin: new S3Origin(wwwBucket),
                viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: cf.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachePolicy: new cf.CachePolicy(this, "wwwDistributionCachePolicy", {
                    minTtl: Duration.days(90)
                }),
            },

            priceClass: cf.PriceClass.PRICE_CLASS_100,
            domainNames: [projectDomainName],
            certificate,
        });

        new CfnOutput(this, "wwwDistributionId", {value: wwwDistribution.distributionId});


        // Register Route 53 record
        new route53.ARecord(this, "dnsRecord", {
            zone: projectHostedZone,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(wwwDistribution)),

            // Omitting 'recordName' will create a record for the zone root
            // recordName: STACK_NAME,
        });
        new CfnOutput(this, "projectDomainName", {value: projectDomainName});
    }
}


if (!STACK_NAME) throw new Error("STACK_NAME not defined");
if (!DOMAIN_NAME) throw new Error("DOMAIN_NAME not defined");
if (!PARENT_HOSTED_ZONE_EDITOR_ROLE_ARN) throw new Error("PARENT_HOSTED_ZONE_EDITOR_ROLE_ARN not defined");
const app = new App();
new ProjectStack(app, STACK_NAME);
app.synth();
