#!/bin/sh
set -e
set -u

echo "This dangerous script has been disabled"
exit # Comment out this line to proceed

# Import required variables
. ./context.sh

# Empty www bucket - otherwise the stack cannot be destroyed
WWW_BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME-project" --query "Stacks[0].Outputs[?OutputKey=='wwwBucketName'].OutputValue" --output text)
aws s3 rm --recursive s3://"$WWW_BUCKET_NAME"

# Delete all CNAME records in the subzone - otherwise the stack cannot be destroyed
HOSTED_ZONE_ID=$(aws cloudformation --region us-east-1 describe-stacks --stack-name "$STACK_NAME-us-east" --query "Stacks[0].Outputs[?OutputKey=='projectHostedZoneId'].OutputValue" --output text)
LIST_RESOURCE_RECORD_SETS=$(aws route53 list-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --query "ResourceRecordSets[?Type=='CNAME']" --output text)

if [ -n "${LIST_RESOURCE_RECORD_SETS}" ]
then
  echo "$LIST_RESOURCE_RECORD_SETS" | while read -r line1; do
    read -r RECORD_NAME RECORD_TTL null <<<"$line1"
    read -r line2
    read -r null RECORD_VALUE <<<"$line2"

    RECORD_VALUE=$(echo $RECORD_VALUE | tr -dc '[0-9A-Za-z_\.\-]')

    aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --change-batch \
      "{
         \"Changes\": [
           {
             \"Action\": \"DELETE\",
             \"ResourceRecordSet\": {
               \"Type\": \"CNAME\",
               \"Name\": \"$RECORD_NAME\",
               \"TTL\": $RECORD_TTL,
               \"ResourceRecords\": [
                 {
                   \"Value\": \"$RECORD_VALUE\"
                 }
               ]
             }
           }
         ]
       }"
  done
fi

# Destroy CDK
cd cdk
npm run destroy
cd -

# Delete logs
PREFIX=/aws/lambda/$(echo "$STACK_NAME" | cut -c 1-25) # Log group name shows first 25 characters of stack name only
# See https://stackoverflow.com/a/56034540/226513 regarding MSYS_NO_PATHCONV
logGroupNames=$(MSYS_NO_PATHCONV=1 aws logs describe-log-groups --log-group-name-prefix "$PREFIX" --query 'logGroups[*].logGroupName' --output text)
for logGroupName in $logGroupNames; do
  echo "Delete $logGroupName"
  MSYS_NO_PATHCONV=1 aws logs delete-log-group --log-group-name "$logGroupName"
done
