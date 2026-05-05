import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { QuestionsService, type QuestionListQuery } from "./questions.service";

@Controller("questions")
export class QuestionsController {
  constructor(@Inject(QuestionsService) private readonly questionsService: QuestionsService) {}

  @Get()
  list(@Query() query: QuestionListQuery) {
    return this.questionsService.listPublic(query);
  }

  @Get(":id/recite")
  reciteDetail(@Param("id") id: string) {
    return this.questionsService.getReciteDetail(id);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.questionsService.getPublicDetail(id);
  }
}
