import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';

async function main(): Promise<void> {
  const bucket = process.env.S3_BUCKET ?? 'streamtube-videos';
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://minio:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? 'streamtube',
      secretAccessKey: process.env.S3_SECRET_KEY ?? 'streamtube-secret',
    },
  });

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      console.log('Checking video bucket');
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      break;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) {
        console.log('Creating video bucket');
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        break;
      }
      if (attempt === 29) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  s3.destroy();
}

void main();
