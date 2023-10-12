#!/bin/sh
set -e
set -u

# Import required variables
. ./context.sh

# Deploy CDK
cd cdk
#npm run bootstrap
npm run deploy
cd -

# Upload static HTML
WWW_BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME-project" --query "Stacks[0].Outputs[?OutputKey=='wwwBucketName'].OutputValue" --output text)
aws s3 cp www/index.html "s3://$WWW_BUCKET_NAME/"

# Invalidate CloudFront cache (must be done in us-east-1)
WWW_DISTRIBUTION_ID=$(aws --region us-east-1 cloudformation describe-stacks --stack-name "$STACK_NAME-us-east" --query "Stacks[0].Outputs[?OutputKey=='wwwDistributionId'].OutputValue" --output text)
aws cloudfront create-invalidation --distribution-id "$WWW_DISTRIBUTION_ID" --paths "/*"

# Retrieve www public URL (must be done in us-east-1)
PROJECT_DOMAIN_NAME=$(aws --region us-east-1 cloudformation describe-stacks --stack-name "$STACK_NAME-us-east" --query "Stacks[0].Outputs[?OutputKey=='projectDomainName'].OutputValue" --output text)
echo "* Public URL: $PROJECT_DOMAIN_NAME"
