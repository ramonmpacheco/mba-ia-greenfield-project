import { Module } from '@nestjs/common';
import { AppModule } from '../app.module';
import { VideoProcessor } from './video.processor';
import { VideosModule } from './videos.module';

@Module({
  imports: [AppModule, VideosModule],
  providers: [VideoProcessor],
})
export class VideoWorkerModule {}
