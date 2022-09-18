#!/bin/sh
set -e
set -u

# Import required variables
. ./context.sh

# Empty www bucket
WWW_BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='wwwBucketName'].OutputValue" --output text)
aws s3 rm --recursive s3://"$WWW_BUCKET_NAME"

# Deploy CDK
cd cdk
cdk destroy --force
cd -

# Delete logs
PREFIX=/aws/lambda/$(echo "$STACK_NAME" | cut -c 1-25) # Log group name shows first 25 characters of stack name only
# See https://stackoverflow.com/a/56034540/226513 regarding MSYS_NO_PATHCONV
logGroupNames=$(MSYS_NO_PATHCONV=1 aws logs describe-log-groups --log-group-name-prefix "$PREFIX" --query 'logGroups[*].logGroupName' --output text)
for logGroupName in $logGroupNames; do
  echo "Delete $logGroupName"
  MSYS_NO_PATHCONV=1 aws logs delete-log-group --log-group-name "$logGroupName"
done
