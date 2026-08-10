export {
  attachToConversation,
  listConversationAttachments,
  listConversations,
  listCorrespondents,
  listMessages,
  markRead,
  messageAttachmentUrl,
  sendMessage,
  startConversation,
  withdrawMessage,
  type ConversationSummary,
  type Correspondent,
  type MessageAttachment,
  type MessageWithSender,
} from './api/messages.service';

export {
  useConversationAttachments,
  useConversations,
  useCorrespondents,
  useMessageMutations,
  useMessages,
} from './hooks/use-messages';

export { NewConversationDialog } from './components/new-conversation-dialog';

export { default as MessagesPage } from './pages/messages-page';
