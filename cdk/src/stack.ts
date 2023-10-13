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
if (!STACK_NAME) throw new Error("STACK_NAME not defined");

const DOMAIN_NAME = process.env.DOMAIN_NAME!;
if (!DOMAIN_NAME) throw new Error("DOMAIN_NAME not defined");

const PARENT_HOSTED_ZONE_EDITOR_ROLE_ARN = process.env.PARENT_HOSTED_ZONE_EDITOR_ROLE_ARN!;
if (!PARENT_HOSTED_ZONE_EDITOR_ROLE_ARN) throw new Error("PARENT_HOSTED_ZONE_EDITOR_ROLE_ARN not defined");

const AWS_REGION = process.env.AWS_REGION!;
if (!AWS_REGION) throw new Error("AWS_REGION not defined");

/**
 * The Project stack is created in the default AWS region
 */
class ProjectStack extends Stack {

    public readonly wwwBucket: s3.Bucket;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Create bucket for static web content
        this.wwwBucket = new s3.Bucket(this, "wwwBucket", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        new CfnOutput(this, "wwwBucketName", {value: this.wwwBucket.bucketName});
    }
}


/**
 * The HTTPS certificate MUST be created in the us-east-1 region.  For convenience, non-region-specific resources such
 * as DNS records and the Cloudfront distribution are also created in this region.
 */
class UsEastStack extends Stack {

    public certificate: acm.Certificate;

    constructor(scope: Construct, id: string, wwwBucket: s3.Bucket, props?: StackProps) {
        super(scope, id, props);


        // Create a "delegated" (sub) hosted zone specifically for this stack
        // This means that this stack has its own hosted zone where it can edit its own DNS records
        const projectDomainName = STACK_NAME + "." + DOMAIN_NAME;
        const projectHostedZone = new route53.PublicHostedZone(this, "projectHostedZone", {zoneName: projectDomainName});
        new CfnOutput(this, "projectHostedZoneId", {value: projectHostedZone.hostedZoneId});


        // Create an NS record in the PARENT ZONE which points to this sub zone
        // To perform this task, we must assume a specific role provided by the parent account
        const parentHostedZoneEditorRole = Role.fromRoleArn(this, "parentHostedZoneEditorRole", PARENT_HOSTED_ZONE_EDITOR_ROLE_ARN);
        new route53.CrossAccountZoneDelegationRecord(this, "projectHostedZoneDelegate", {
            delegatedZone: projectHostedZone,
            parentHostedZoneName: DOMAIN_NAME,
            delegationRole: parentHostedZoneEditorRole,
        });


        // Create an HTTPS certificate
        // To be used by Cloudfront, this certificate MUST be created in the us-east-1 region
        const certificate = new acm.Certificate(this, "certificate", {
            domainName: projectDomainName,

            // AWS Certificate Manager will validate that we own the domain name by writing a CNAME record
            // to the project's hosted zone and then doing a public DNS lookup to verify that the record exists
            validation: acm.CertificateValidation.fromDns(projectHostedZone),
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


        // Register Route 53 DNS A record
        new route53.ARecord(this, "dnsRecord", {
            zone: projectHostedZone,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(wwwDistribution)),

            // Omitting recordName will create a record for the zone root, e.g. hello.example.com
            // If we did specify a value then the record will be created for a subdomain, e.g. www.hello.example.com

            // recordName: "www",
        });
        new CfnOutput(this, "projectDomainName", {value: projectDomainName});
    }
}


const app = new App();

const projectStack = new ProjectStack(app, STACK_NAME + "-project", {
    env: {region: AWS_REGION},
    crossRegionReferences: true
});

new UsEastStack(app, STACK_NAME + "-us-east", projectStack.wwwBucket, {
    env: {region: "us-east-1"},
    crossRegionReferences: true
});

app.synth();
