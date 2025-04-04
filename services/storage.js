const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');

class StorageService {
    constructor() {
        this.s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
        this.bucketName = process.env.AWS_S3_BUCKET;
    }

    async uploadFile(fileBuffer, fileName) {
        const key = `uploads/${Date.now()}-${fileName}`;
        
        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: fileBuffer,
            ContentType: 'text/csv'
        });

        await this.s3Client.send(command);
        return key;
    }

    async getFileUrl(key) {
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key
        });

        // Generate a signed URL that expires in 1 hour
        return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    }

    async deleteFile(key) {
        const command = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key
        });

        await this.s3Client.send(command);
    }

    async downloadFile(key) {
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key
        });

        const response = await this.s3Client.send(command);
        return response.Body;
    }
}

module.exports = new StorageService(); 