import { addressSchema, type MailMessage, type ReceivedAddress } from "./contracts";

/** A reply targets Reply-To when the header carries one, otherwise From. */
export function replyTargets(message: Pick<MailMessage, "from" | "replyTo">): ReceivedAddress[] {
  return message.replyTo?.length ? message.replyTo : message.from ? [message.from] : [];
}

/**
 * Reply recipients, mirroring how the engine derives them from the original message when a
 * reply is sent without explicit ones: the reply targets, plus the original To and Cc for a
 * reply-all, minus the replying account.
 */
export function replyRecipients(
  accountEmail: string,
  message: MailMessage,
  replyAll: boolean,
): { to: ReceivedAddress[]; cc: ReceivedAddress[] } {
  const own = { email: accountEmail };
  const targets = replyTargets(message);
  if (!replyAll) {
    const to = dedupe(targets).filter((address) => !sameAddress(address, own));
    // Replying to yourself, as in a note in Sent: fall back to who the message went to.
    return { to: to.length ? to : dedupe(message.to), cc: [] };
  }
  const to = dedupe([...targets, ...message.to]).filter((address) => !sameAddress(address, own));
  const cc = dedupe(message.cc ?? []).filter(
    (address) =>
      !sameAddress(address, own) && !to.some((recipient) => sameAddress(recipient, address)),
  );
  return { to, cc };
}

/**
 * Received headers carry addresses no provider will accept, such as the truncated
 * "someone@gmail.c..." in a PayPal receipt. Replying to those messages has to name its
 * recipients explicitly so the sender can correct the address first.
 */
export function hasUnsendableReplyRecipient(
  accountEmail: string,
  message: MailMessage,
  replyAll: boolean,
): boolean {
  const { to, cc } = replyRecipients(accountEmail, message, replyAll);
  return [...to, ...cc].some((address) => !addressSchema.safeParse(address).success);
}

function dedupe(addresses: ReceivedAddress[]): ReceivedAddress[] {
  const unique: ReceivedAddress[] = [];
  for (const address of addresses)
    if (address.email && !unique.some((other) => sameAddress(other, address))) unique.push(address);
  return unique;
}

function sameAddress(left: ReceivedAddress, right: ReceivedAddress): boolean {
  return left.email.trim().toLowerCase() === right.email.trim().toLowerCase();
}
