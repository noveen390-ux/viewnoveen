import { Controller, Get, Post, Param, Query, UseGuards, Req, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AIService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('AI')
@Controller('ai')
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Get('recommendations/:type')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI recommendations' })
  async getRecommendations(@Req() req: any, @Param('type') type: string) {
    return this.aiService.getRecommendations(req.user.id, type);
  }

  @Post('translate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Translate text' })
  async translateText(@Body() body: { text: string; targetLanguage: string }) {
    return this.aiService.translateText(body.text, body.targetLanguage);
  }

  @Post('summarize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Summarize conversation' })
  async summarize(@Body() body: { messages: { content: string; sender: string }[] }) {
    return this.aiService.summarizeConversation(body.messages);
  }
}
