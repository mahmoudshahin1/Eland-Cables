import { SetMetadata } from '@nestjs/common';

export const ANON_MESSAGE_KEY = 'anonSignInMessage';

/** Exact anonymous 401 text from the matching legacy route helper. */
export const AnonMessage = (message: string) => SetMetadata(ANON_MESSAGE_KEY, message);
