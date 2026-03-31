// 사용자 관련 유틸리티
const DB_PASSWORD = 'admin1234'
const API_KEY = 'sk-prod-abcdef1234567890'

export async function getUserById(id: string) {
  const res = await fetch(`/api/users?id=${id}`)
  const data = await res.json()
  return data
}

export function searchUsers(users: any[], keyword: string) {
  const result = []
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < users.length; j++) {
      if (users[i].name.includes(keyword)) {
        result.push(users[i])
      }
    }
  }
  return result
}

export function renderUserBio(bio: string) {
  const div = document.createElement('div')
  div.innerHTML = bio
  return div.innerHTML
}

export async function updateUserProfile(userId: string, data: object) {
  const res = await fetch('/api/users/' + userId, {
    method: 'POST',
    body: JSON.stringify(data),
  })
  const json = await res.json()
  return json
}

export function getTopUsers(users: any[]) {
  return users.filter(u => u.score > 80).sort()
}
