#!/bin/sh
set -e
set -u

echo "This dangerous script has been disabled"
exit # Comment out this line to proceed

# Import required variables
. ./context.sh

# Empty www bucket
WWW_BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='wwwBucketName'].OutputValue" --output text)
aws s3 rm --recursive s3://"$WWW_BUCKET_NAME"

# Destroy CDK
cd cdk
cdk destroy --force
cd -
