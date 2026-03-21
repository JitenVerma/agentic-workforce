import { RoomSessionPage } from "@/components/room-session-page";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  return <RoomSessionPage roomId={roomId} />;
}
