This sample project demonstrates how to use the AWS CDK serve static web content using a Cloudfront distribution. The Cloudfront distribution is given a domain name and an HTTPS certificate, even though the Route 53 hosted zone is owned by a different AWS Account (the parent account).

## Instructions

1. Create `HostedZoneEditorRole` in your parent AWS Account (see below)
2. Edit the file `context.sh` and set values specific to your environment
3. Run `./deploy.sh`


## Technical Details

This project runs within the child account (see below) and uses the AWS CDK to:

* Create a private S3 bucket, containing a simple `index.html`
* Create a Route 53 hosted zone. This gives the child account its own set of DNS nameservers, which can be used to register A records as well as provide validation (via CNAME records) when obtaining HTTPS certificates from Amazon Certificate Manager (ACM)
* Create a "delegated zone" using the Route 53 CDK construct `CrossAccountZoneDelegationRecord`.  This creates an NS record in the parent hosted zone for `hello.example.com`, which points to the nameservers of the child hosted zone.  To complete this operation we must assume an IAM Role which exists in the parent account and which allows us to create an NS record (see below).
* Create an AWS Cloudfront distribution to share the S3 bucket content
* Create a DNS entry (A record) which points to the Cloudfront distribution using the child hosted zone. We register an A record against the "zone root" of the child hosted zone, i.e. `hello.example.com`
* Enable HTTPS by adding a certificate from AWS ACM to the Cloudfront distribution


## Accounts

This sample project assumes the existence of the following two AWS Accounts:

### 1. The parent account `ID=111111111111`

This account has an AWS Route 53 hosted zone for `example.com`  The hosted zone ID is `AAAAAAAAAAAAAA`

The parent account must also contain an IAM Role called `HostedZoneEditorRole` which allows child accounts to create records in the hosted zone.  See details below.

### 2. The child account `ID=222222222222`

This account uses the AWS CDK to publish a website at the URL `https://hello.example.com`

It creates its own hosted zone to write DNS records. The parent hosted zone is then configured so that `hello.example.com` points to the child hosted zone. A "zone root" DNS record in the child hosted zone points `hello.example.com` to the Cloudfront distribution.


# How to create `HostedZoneEditorRole`

In the parent account, create a new Role using the AWS Console.

The type of trusted entity is 'AWS Account', specify account `222222222222`  This will allow the child account to assume this role.

Add a policy with the following contents:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "route53:ChangeResourceRecordSets",
            "Resource": "arn:aws:route53:::hostedzone/AAAAAAAAAAAAAA"
        },
        {
            "Effect": "Allow",
            "Action": "route53:ListHostedZonesByName",
            "Resource": "*"
        }
    ]
}
```

This will allow the child account to create DNS records in the parent hosted zone.

The new Role's trust policy should look like this:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::222222222222:root"
            },
            "Action": "sts:AssumeRole",
            "Condition": {}
        }
    ]
}
```

Instead of using the AWS Console, you could instead use AWS CLI or even CDK to create the new IAM Role in the parent account.
