import { Global, Module } from '@nestjs/common';
import { CodeSequenceService } from './code-sequence.service';

/**
 * Global — mecanisme de nucleu reutilizabile de orice modul de business
 * (ex. `CodeSequenceService`, vezi docs/data-model.md). Nu adăuga aici
 * logică specifică unui modul — asta rupe izolarea (regula #2 CLAUDE.md).
 */
@Global()
@Module({
  providers: [CodeSequenceService],
  exports: [CodeSequenceService],
})
export class CommonModule {}
