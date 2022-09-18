#!/bin/sh
set -e
set -u

# Import required variables
. ./context.sh

# Deploy CDK
cd cdk
cdk deploy --require-approval never
cd -

# Upload static HTML
WWW_BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='wwwBucketName'].OutputValue" --output text)
aws s3 cp www/index.html "s3://$WWW_BUCKET_NAME/"

# Invalidate CloudFront cache
WWW_DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='wwwDistributionId'].OutputValue" --output text)
aws cloudfront create-invalidation --distribution-id "$WWW_DISTRIBUTION_ID" --paths "/*"

# Display www public URL
PROJECT_DOMAIN_NAME=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='projectDomainName'].OutputValue" --output text)
echo "* Public URL: $PROJECT_DOMAIN_NAME"
